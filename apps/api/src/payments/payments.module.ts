import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { PaymentsController } from './payments.controller';
import { PaymentsService } from './payments.service';
import { PaymentSessionService } from './payment-session.service';
import { PaymentWatcherService } from './payment-watcher.service';
import { PaymentProcessorService } from './payment-processor.service';

@Module({
  imports: [BullModule.registerQueue({ name: 'agents' })],
  controllers: [PaymentsController],
  providers: [
    PaymentsService,
    PaymentSessionService,
    PaymentWatcherService,
    PaymentProcessorService,
  ],
  exports: [PaymentSessionService],
})
export class PaymentsModule {}
