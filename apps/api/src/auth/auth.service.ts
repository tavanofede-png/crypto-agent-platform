import {
  Injectable,
  UnauthorizedException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { verifyMessage, getAddress } from 'viem';

export interface JwtPayload {
  sub: string;
  walletAddress: string;
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly config: ConfigService,
  ) {}

  // ─── Step 1: issue nonce ────────────────────────────────────────────────────

  /**
   * POST /api/auth/nonce
   *
   * Creates a single-use, time-limited authentication challenge.
   * The returned `message` is the EXACT string the wallet must sign — no
   * alteration is allowed.  Expired and unused nonces are cleaned up here.
   */
  async requestNonce(walletAddress: string): Promise<{
    nonce: string;
    message: string;
    expiresAt: string;
  }> {
    const address = this.normalizeAddress(walletAddress);

    // Ensure user record exists before issuing a nonce.
    await this.prisma.user.upsert({
      where:  { walletAddress: address },
      create: { walletAddress: address },
      update: {},
    });

    // Clean up expired unused nonces for this wallet (house-keeping).
    await this.prisma.authNonce.deleteMany({
      where: {
        walletAddress: address,
        usedAt:        null,
        expiresAt:     { lt: new Date() },
      },
    });

    const nonce      = crypto.randomUUID();
    const ttl        = this.config.get<number>('NONCE_TTL_MINUTES', 10);
    const issuedAt   = new Date();
    const expiresAt  = new Date(Date.now() + ttl * 60_000);
    const message    = this.buildSignMessage(address, nonce, issuedAt, expiresAt);

    await this.prisma.authNonce.create({
      data: { walletAddress: address, nonce, message, expiresAt },
    });

    this.logger.debug(`Nonce issued for ${address}, expires ${expiresAt.toISOString()}`);
    return { nonce, message, expiresAt: expiresAt.toISOString() };
  }

  // ─── Step 2: verify signature ───────────────────────────────────────────────

  /**
   * POST /api/auth/verify
   *
   * Security checks performed in order:
   *  1. Nonce exists in DB for this wallet
   *  2. Nonce has not been used before (prevents replay)
   *  3. Nonce has not expired
   *  4. Provided message matches the message issued for this nonce
   *  5. viem.verifyMessage confirms the signature matches the wallet address
   *
   * On success the nonce is immediately marked as used and a JWT pair issued.
   */
  async verifySignature(dto: {
    walletAddress: string;
    nonce:         string;
    message:       string;
    signature:     string;
  }): Promise<{
    accessToken:  string;
    refreshToken: string;
    user: { id: string; walletAddress: string };
  }> {
    const address = this.normalizeAddress(dto.walletAddress);

    const authNonce = await this.prisma.authNonce.findUnique({
      where: { nonce: dto.nonce },
    });

    if (!authNonce || authNonce.walletAddress !== address) {
      throw new UnauthorizedException('Invalid or expired nonce');
    }
    if (authNonce.usedAt) {
      throw new UnauthorizedException('Nonce has already been used');
    }
    if (new Date() > authNonce.expiresAt) {
      throw new UnauthorizedException('Nonce has expired');
    }
    if (authNonce.message !== dto.message) {
      throw new UnauthorizedException('Message does not match issued challenge');
    }

    // Verify the ECDSA signature with viem.
    let valid = false;
    try {
      valid = await verifyMessage({
        address:   address as `0x${string}`,
        message:   dto.message,
        signature: dto.signature as `0x${string}`,
      });
    } catch {
      valid = false;
    }

    // Dev-only bypass — only active when ALLOW_MOCK_AUTH=true is explicitly set.
    // Must never appear in production environments.
    if (!valid) {
      const allowMock = this.config.get<string>('ALLOW_MOCK_AUTH') === 'true';
      if (allowMock && dto.signature.startsWith('0xmock')) {
        valid = true;
        this.logger.warn(
          `[DEV] Mock signature accepted for ${address}. ` +
          `Remove ALLOW_MOCK_AUTH from env to require real signatures.`,
        );
      }
    }

    if (!valid) {
      throw new UnauthorizedException('Signature verification failed');
    }

    // Consume the nonce — single use.
    await this.prisma.authNonce.update({
      where: { nonce: dto.nonce },
      data:  { usedAt: new Date() },
    });

    // Get or create the user record.
    const user = await this.prisma.user.upsert({
      where:  { walletAddress: address },
      create: { walletAddress: address },
      update: { updatedAt: new Date() },
    });

    const accessToken  = this.signAccessToken(user);
    const refreshToken = this.signRefreshToken(user);

    this.logger.log(`Authenticated: ${address}`);

    return {
      accessToken,
      refreshToken,
      user: { id: user.id, walletAddress: user.walletAddress },
    };
  }

  // ─── Step 3: refresh access token ──────────────────────────────────────────

  /**
   * POST /api/auth/refresh
   *
   * Verifies the long-lived refresh token and issues a new short-lived
   * access token.  Does NOT rotate the refresh token (stateless MVP).
   */
  async refreshAccessToken(refreshToken: string): Promise<{
    accessToken: string;
    user: { id: string; walletAddress: string };
  }> {
    let payload: JwtPayload;
    try {
      payload = this.jwtService.verify(refreshToken, {
        secret: this.refreshSecret(),
      }) as JwtPayload;
    } catch {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }

    const user = await this.prisma.user.findUnique({ where: { id: payload.sub } });
    if (!user) throw new UnauthorizedException('User not found');

    return {
      accessToken: this.signAccessToken(user),
      user: { id: user.id, walletAddress: user.walletAddress },
    };
  }

  // ─── Me (used by JWT strategy) ──────────────────────────────────────────────

  async validateUser(payload: JwtPayload) {
    return this.prisma.user.findUnique({ where: { id: payload.sub } });
  }

  // ─── Private helpers ────────────────────────────────────────────────────────

  /**
   * Builds a human-readable EIP-4361-inspired sign-in message.
   * The exact text is stored in `AuthNonce.message` and must not change
   * between issuance and verification.
   */
  private buildSignMessage(
    address:   string,
    nonce:     string,
    issuedAt:  Date,
    expiresAt: Date,
  ): string {
    return [
      'CryptoAgent wants you to sign in',
      '',
      `Wallet: ${address}`,
      `Nonce: ${nonce}`,
      `Issued At: ${issuedAt.toISOString()}`,
      `Expiration Time: ${expiresAt.toISOString()}`,
      '',
      'By signing this message you confirm ownership of the wallet above.',
      'This does not trigger any blockchain transaction or cost any gas.',
    ].join('\n');
  }

  private normalizeAddress(raw: string): string {
    try {
      return getAddress(raw).toLowerCase();
    } catch {
      throw new BadRequestException(`Invalid Ethereum address: ${raw}`);
    }
  }

  private signAccessToken(user: { id: string; walletAddress: string }): string {
    const payload: JwtPayload = { sub: user.id, walletAddress: user.walletAddress };
    return this.jwtService.sign(payload, {
      expiresIn: this.config.get<string>(
        'JWT_ACCESS_EXPIRES_IN',
        this.config.get<string>('JWT_EXPIRES_IN', '1h'),
      ),
    });
  }

  private signRefreshToken(user: { id: string; walletAddress: string }): string {
    const payload: JwtPayload = { sub: user.id, walletAddress: user.walletAddress };
    return this.jwtService.sign(payload, {
      secret:    this.refreshSecret(),
      expiresIn: this.config.get<string>('JWT_REFRESH_EXPIRES_IN', '7d'),
    });
  }

  private refreshSecret(): string {
    return (
      this.config.get<string>('JWT_REFRESH_SECRET') ||
      this.config.get<string>('JWT_SECRET', 'fallback-secret')
    );
  }
}
