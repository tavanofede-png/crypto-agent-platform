import {
  Controller,
  Post,
  Get,
  Body,
  UseGuards,
  Request,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import {
  IsString,
  IsEthereumAddress,
  IsNotEmpty,
  IsUUID,
  Matches,
} from 'class-validator';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from './jwt-auth.guard';

// ─── DTOs ─────────────────────────────────────────────────────────────────────

class RequestNonceDto {
  @IsEthereumAddress()
  walletAddress!: string;
}

class VerifySignatureDto {
  @IsEthereumAddress()
  walletAddress!: string;

  /** UUID nonce returned by POST /auth/nonce */
  @IsUUID('4')
  nonce!: string;

  /** The exact message returned by POST /auth/nonce — must be sent back verbatim */
  @IsString()
  @IsNotEmpty()
  message!: string;

  /** EIP-191 personal_sign output — 0x-prefixed hex */
  @IsString()
  @Matches(/^0x[0-9a-fA-F]+$/, { message: 'signature must be a 0x-prefixed hex string' })
  signature!: string;
}

class RefreshTokenDto {
  @IsString()
  @IsNotEmpty()
  refreshToken!: string;
}

// ─── Controller ───────────────────────────────────────────────────────────────

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  /**
   * POST /api/auth/nonce
   *
   * Step 1 — issues a one-time, time-limited challenge.
   * Returns the exact message the wallet must sign.
   */
  @Post('nonce')
  @HttpCode(HttpStatus.OK)
  requestNonce(@Body() dto: RequestNonceDto) {
    return this.authService.requestNonce(dto.walletAddress);
  }

  /**
   * POST /api/auth/verify
   *
   * Step 2 — verifies the EIP-191 signature against the issued nonce.
   * Returns accessToken + refreshToken on success.
   * Nonce is consumed immediately (single-use).
   */
  @Post('verify')
  @HttpCode(HttpStatus.OK)
  verify(@Body() dto: VerifySignatureDto) {
    return this.authService.verifySignature({
      walletAddress: dto.walletAddress,
      nonce:         dto.nonce,
      message:       dto.message,
      signature:     dto.signature,
    });
  }

  /**
   * POST /api/auth/refresh
   *
   * Exchanges a valid refresh token for a new short-lived access token.
   * Does not require an Authorization header.
   */
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  refresh(@Body() dto: RefreshTokenDto) {
    return this.authService.refreshAccessToken(dto.refreshToken);
  }

  /**
   * POST /api/auth/logout
   *
   * Stateless — instructs the client to discard its tokens.
   * A future implementation could maintain a server-side token blocklist here.
   */
  @Post('logout')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard)
  logout() {
    return { success: true };
  }

  /**
   * GET /api/auth/me
   *
   * Returns the authenticated user's profile.
   */
  @Get('me')
  @UseGuards(JwtAuthGuard)
  getMe(@Request() req: any) {
    const { id, walletAddress, createdAt } = req.user;
    return { id, walletAddress, createdAt };
  }
}
