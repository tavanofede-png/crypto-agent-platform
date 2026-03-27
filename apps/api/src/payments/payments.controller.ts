import { Controller, Get, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PaymentsService } from './payments.service';

@Controller('payments')
@UseGuards(JwtAuthGuard)
export class PaymentsController {
  constructor(private readonly paymentsService: PaymentsService) {}

  /**
   * GET /api/payments/info
   * Returns treasury address and supported chains / tokens.
   * Used by the frontend to display payment details.
   */
  @Get('info')
  getInfo() {
    return this.paymentsService.getPaymentInfo();
  }
}
