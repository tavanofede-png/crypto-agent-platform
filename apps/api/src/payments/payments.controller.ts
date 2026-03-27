import {
  Controller,
  Get,
  Post,
  Body,
  UseGuards,
  Request,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PaymentsService } from './payments.service';
import { IsString, IsNumber, IsOptional, Min } from 'class-validator';

class InitiatePaymentDto {
  @IsNumber()
  @Min(1)
  amount!: number;

  @IsString()
  token!: string;

  @IsNumber()
  chainId!: number;
}

class ConfirmPaymentDto {
  @IsString()
  txHash!: string;

  @IsString()
  walletAddress!: string;
}

class MockPaymentDto {
  @IsNumber()
  @Min(1)
  amount!: number;
}

@Controller('payments')
@UseGuards(JwtAuthGuard)
export class PaymentsController {
  constructor(private readonly paymentsService: PaymentsService) {}

  @Get('info')
  getInfo() {
    return this.paymentsService.getPaymentInfo();
  }

  @Post('initiate')
  initiate(@Body() dto: InitiatePaymentDto, @Request() req: any) {
    return this.paymentsService.initiatePayment({
      walletAddress: req.user.walletAddress,
      ...dto,
    });
  }

  @Post('confirm')
  @HttpCode(HttpStatus.OK)
  confirm(@Body() dto: ConfirmPaymentDto, @Request() req: any) {
    return this.paymentsService.confirmPayment(dto, req.user.id);
  }

  @Post('mock-confirm')
  @HttpCode(HttpStatus.OK)
  mockConfirm(@Body() dto: MockPaymentDto, @Request() req: any) {
    return this.paymentsService.mockConfirm(
      req.user.walletAddress,
      dto.amount,
      req.user.id,
    );
  }

  @Get('transactions')
  getTransactions(@Request() req: any) {
    return this.paymentsService.getTransactions(req.user.id);
  }
}
