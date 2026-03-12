import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  UseGuards,
  ParseIntPipe,
} from '@nestjs/common';
import { TimelineEventsService } from './timeline-events.service';
import { CreateTimelineEventDto } from './dto/create-timeline-event.dto';
import { UpdateTimelineEventDto } from './dto/update-timeline-event.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { Role } from '../auth/enums/role.enum';
import { User } from '../auth/decorators/user.decorator';

@Controller('timeline-events')
@UseGuards(JwtAuthGuard, RolesGuard)
export class TimelineEventsController {
  constructor(private readonly timelineEventsService: TimelineEventsService) {}

  @Post()
  create(@User('id') userId: string, @Body() createDto: CreateTimelineEventDto) {
    return this.timelineEventsService.create(userId, createDto);
  }

  @Get('my-timeline')
  findMyTimeline(@User('id') userId: string) {
    return this.timelineEventsService.findAllByUser(userId);
  }

  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.timelineEventsService.findOne(id);
  }

  @Patch(':id')
  update(
    @Param('id', ParseIntPipe) id: number,
    @User('id') userId: string,
    @Body() updateDto: UpdateTimelineEventDto,
  ) {
    return this.timelineEventsService.update(id, userId, updateDto);
  }

  @Delete(':id')
  @Roles(Role.ADMIN)
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.timelineEventsService.remove(id);
  }
}
