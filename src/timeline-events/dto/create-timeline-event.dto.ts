import { IsEnum, IsNotEmpty, IsObject, IsOptional, IsString } from 'class-validator';

export enum EventType {
  JOIN_BCN = 'JOIN_BCN',
  COURSE_COMPLETE = 'COURSE_COMPLETE',
  QUIZ_COMPLETE = 'QUIZ_COMPLETE',
  PROJECT_COMPLETE = 'PROJECT_COMPLETE',
  SEMESTER_COMPLETE = 'SEMESTER_COMPLETE',
}

export class CreateTimelineEventDto {
  @IsEnum(EventType)
  @IsNotEmpty()
  eventType!: EventType;

  @IsString()
  @IsNotEmpty()
  title!: string;

  @IsObject()
  @IsOptional()
  metadata?: any;
}
