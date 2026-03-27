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
import { AgentOrdersService } from './agent-orders.service';
import { CreateOrderDto } from './dto/create-order.dto';

@Controller('agent-orders')
@UseGuards(JwtAuthGuard)
export class AgentOrdersController {
  constructor(private readonly ordersService: AgentOrdersService) {}

  /**
   * POST /api/agent-orders
   * Submit agent config + receive payment details atomically.
   * Returns the order with an embedded paymentSession (treasury address, amount, expiry).
   */
  @Post()
  create(@Body() dto: CreateOrderDto, @Request() req: any) {
    return this.ordersService.createOrder(dto, req.user.id);
  }

  /**
   * GET /api/agent-orders
   * List all orders for the authenticated user.
   */
  @Get()
  list(@Request() req: any) {
    return this.ordersService.getUserOrders(req.user.id);
  }

  /**
   * GET /api/agent-orders/:id
   * Poll this to track payment and provisioning status.
   * When status === COMPLETED, order.agentId is set — redirect to /agents/:agentId.
   */
  @Get(':id')
  getOne(@Param('id') id: string, @Request() req: any) {
    return this.ordersService.getOrder(id, req.user.id);
  }

  /**
   * POST /api/agent-orders/:id/mock-pay
   * Development only — instantly confirms payment and starts provisioning.
   */
  @Post(':id/mock-pay')
  @HttpCode(HttpStatus.OK)
  mockPay(@Param('id') id: string, @Request() req: any) {
    return this.ordersService.mockPay(id, req.user.id);
  }
}
