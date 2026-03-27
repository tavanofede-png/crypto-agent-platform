import {
  Controller,
  Get,
  Put,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  Request,
  HttpCode,
  HttpStatus,
  ParseIntPipe,
  DefaultValuePipe,
  Post,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AgentsService } from './agents.service';
import { UpdateAgentDto } from './dto/update-agent.dto';

@Controller('agents')
@UseGuards(JwtAuthGuard)
export class AgentsController {
  constructor(private readonly agentsService: AgentsService) {}

  @Get()
  findAll(@Request() req: any) {
    return this.agentsService.findAll(req.user.id);
  }

  @Get(':id')
  findOne(@Param('id') id: string, @Request() req: any) {
    return this.agentsService.findOne(id, req.user.id);
  }

  @Put(':id')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateAgentDto,
    @Request() req: any,
  ) {
    return this.agentsService.update(id, dto, req.user.id);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  remove(@Param('id') id: string, @Request() req: any) {
    return this.agentsService.remove(id, req.user.id);
  }

  @Post(':id/restart')
  restart(@Param('id') id: string, @Request() req: any) {
    return this.agentsService.restart(id, req.user.id);
  }

  @Get(':id/logs')
  getLogs(
    @Param('id') id: string,
    @Request() req: any,
    @Query('limit', new DefaultValuePipe(50), ParseIntPipe) limit: number,
  ) {
    return this.agentsService.getLogs(id, req.user.id, limit);
  }

  @Get(':id/sessions')
  getSessions(@Param('id') id: string, @Request() req: any) {
    return this.agentsService.getSessions(id, req.user.id);
  }

  @Get('sessions/:sessionId/messages')
  getSessionMessages(
    @Param('sessionId') sessionId: string,
    @Request() req: any,
  ) {
    return this.agentsService.getSessionMessages(sessionId, req.user.id);
  }
}
