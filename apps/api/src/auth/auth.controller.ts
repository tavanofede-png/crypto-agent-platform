import {
  Controller,
  Post,
  Get,
  Body,
  Param,
  UseGuards,
  Request,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from './jwt-auth.guard';
import { IsString, IsEthereumAddress } from 'class-validator';

class GetNonceDto {
  @IsEthereumAddress()
  walletAddress!: string;
}

class VerifySignatureDto {
  @IsString()
  walletAddress!: string;

  @IsString()
  signature!: string;
}

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Get('nonce/:address')
  async getNonce(@Param('address') address: string) {
    return this.authService.getNonce(address);
  }

  @Post('verify')
  @HttpCode(HttpStatus.OK)
  async verify(@Body() dto: VerifySignatureDto) {
    return this.authService.verifySignature(dto.walletAddress, dto.signature);
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  async getMe(@Request() req: any) {
    const { id, walletAddress, credits, createdAt } = req.user;
    return { id, walletAddress, credits, createdAt };
  }
}
