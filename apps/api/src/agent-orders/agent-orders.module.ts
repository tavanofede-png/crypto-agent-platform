import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { AgentOrdersController } from './agent-orders.controller';
import { AgentOrdersService } from './agent-orders.service';
import { ChainModule } from '../chain/chain.module';

@Module({
  imports: [
    BullModule.registerQueue({ name: 'agents' }),
    ChainModule,
  ],
  controllers: [AgentOrdersController],
  providers: [AgentOrdersService],
  exports: [AgentOrdersService],
})
export class AgentOrdersModule {}
