import { Injectable, UnauthorizedException, Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../prisma/prisma.service';
import { verifyMessage } from 'viem';

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
  ) {}

  async getNonce(walletAddress: string): Promise<{ nonce: string }> {
    const address = walletAddress.toLowerCase();

    const user = await this.prisma.user.upsert({
      where: { walletAddress: address },
      create: { walletAddress: address },
      update: {},
    });

    return { nonce: user.nonce };
  }

  async verifySignature(
    walletAddress: string,
    signature: string,
  ): Promise<{ accessToken: string; user: { id: string; walletAddress: string } }> {
    const address = walletAddress.toLowerCase() as `0x${string}`;

    const user = await this.prisma.user.findUnique({
      where: { walletAddress: address },
    });

    if (!user) {
      throw new UnauthorizedException('User not found — request a nonce first');
    }

    const message = `Sign in to Crypto Agent Platform\n\nNonce: ${user.nonce}`;

    let valid = false;
    try {
      valid = await verifyMessage({
        address,
        message,
        signature: signature as `0x${string}`,
      });
    } catch {
      // In dev/demo mode, accept mock signatures starting with "0xmock"
      if (process.env.NODE_ENV !== 'production' && signature.startsWith('0xmock')) {
        valid = true;
        this.logger.warn(`Mock signature accepted for ${address} (dev mode)`);
      }
    }

    if (!valid) {
      throw new UnauthorizedException('Invalid signature');
    }

    // Rotate nonce after successful auth
    const updatedUser = await this.prisma.user.update({
      where: { walletAddress: address },
      data: { nonce: crypto.randomUUID() },
    });

    const payload: JwtPayload = {
      sub: updatedUser.id,
      walletAddress: updatedUser.walletAddress,
    };

    const accessToken = this.jwtService.sign(payload);

    this.logger.log(`User authenticated: ${address}`);

    return {
      accessToken,
      user: {
        id: updatedUser.id,
        walletAddress: updatedUser.walletAddress,
      },
    };
  }

  async validateUser(payload: JwtPayload) {
    return this.prisma.user.findUnique({ where: { id: payload.sub } });
  }
}
