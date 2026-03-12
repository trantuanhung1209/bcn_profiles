import { IsEnum, IsObject, IsOptional, IsString } from 'class-validator';
import { EventType } from './create-timeline-event.dto';

export class UpdateTimelineEventDto {
  @IsEnum(EventType)
  @IsOptional()
  eventType?: EventType;

  @IsString()
  @IsOptional()
  title?: string;

  @IsObject()
  @IsOptional()
  metadata?: any;
}
