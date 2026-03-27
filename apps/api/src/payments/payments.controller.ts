import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  UseGuards,
  Request,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PaymentSessionService } from './payment-session.service';
import { PaymentsService } from './payments.service';
import { CreatePaymentSessionDto } from './dto/create-session.dto';
import { IsNumber, IsString, Min, IsOptional } from 'class-validator';

class MockConfirmDto {
  @IsNumber()
  @Min(1)
  amount!: number;
}

class LegacyConfirmDto {
  @IsString()
  txHash!: string;

  @IsString()
  walletAddress!: string;
}

@Controller('payments')
@UseGuards(JwtAuthGuard)
export class PaymentsController {
  constructor(
    private readonly sessionService: PaymentSessionService,
    private readonly paymentsService: PaymentsService,
  ) {}

  // ─── Payment info (supported chains / tokens / treasury) ──

  @Get('info')
  getInfo() {
    return this.paymentsService.getPaymentInfo();
  }

  // ─── Session endpoints ─────────────────────────────────────

  /**
   * POST /api/payments/session
   * Create a new payment session for agent creation or credit top-up.
   * Returns the treasury address, expected amount, and session ID.
   */
  @Post('session')
  createSession(@Body() dto: CreatePaymentSessionDto, @Request() req: any) {
    return this.sessionService.createSession(dto, req.user.id);
  }

  /**
   * GET /api/payments/session/:id
   * Poll this endpoint to get the current session status.
   * Frontend should poll every 3-5 seconds after the user sends a transaction.
   */
  @Get('session/:id')
  getSession(@Param('id') id: string, @Request() req: any) {
    return this.sessionService.getSession(id, req.user.id);
  }

  /**
   * GET /api/payments/sessions
   * Returns all sessions for the authenticated user.
   */
  @Get('sessions')
  getSessions(@Request() req: any) {
    return this.sessionService.getUserSessions(req.user.id);
  }

  /**
   * GET /api/payments/history
   * Returns credit ledger + all sessions.
   */
  @Get('history')
  getHistory(@Request() req: any) {
    return this.paymentsService.getHistory(req.user.id);
  }

  // ─── Dev / mock endpoints ──────────────────────────────────

  /**
   * POST /api/payments/mock-confirm
   * Development only: instantly confirm a mock payment and add credits.
   * Disabled in production.
   */
  @Post('mock-confirm')
  @HttpCode(HttpStatus.OK)
  mockConfirm(@Body() dto: MockConfirmDto, @Request() req: any) {
    return this.paymentsService.mockConfirm(
      req.user.walletAddress,
      dto.amount,
      req.user.id,
    );
  }

  // ─── Legacy endpoints (kept for compatibility) ─────────────

  @Post('confirm')
  @HttpCode(HttpStatus.OK)
  legacyConfirm(@Body() dto: LegacyConfirmDto, @Request() req: any) {
    return this.paymentsService.confirmPayment(dto, req.user.id);
  }

  @Get('transactions')
  getTransactions(@Request() req: any) {
    return this.paymentsService.getTransactions(req.user.id);
  }
}
