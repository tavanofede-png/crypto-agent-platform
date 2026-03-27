import { Module, OnModuleInit } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
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
export class PaymentsModule implements OnModuleInit {
  constructor(private readonly moduleRef: ModuleRef) {}

  async onModuleInit() {
    // Wire AgentOrdersService into PaymentSessionService after both modules are loaded,
    // avoiding a circular module dependency.
    try {
      const { AgentOrdersService } = await import('../agent-orders/agent-orders.service');
      const agentOrdersService = this.moduleRef.get(AgentOrdersService, { strict: false });
      const sessionService = this.moduleRef.get(PaymentSessionService, { strict: false });
      if (agentOrdersService && sessionService) {
        sessionService.setAgentOrdersService(agentOrdersService);
      }
    } catch {
      // AgentOrdersModule not loaded yet or not available — safe to ignore
    }
  }
}
