import {
  IsString,
  IsEnum,
  IsOptional,
  IsNumber,
  Min,
  Max,
  MinLength,
  MaxLength,
} from 'class-validator';

export enum AgentFrameworkDto {
  OPENCLAW = 'OPENCLAW',
  ZEROCLAW = 'ZEROCLAW',
}

export enum SkillTemplate {
  RESEARCH = 'research',
  TRADING = 'trading',
  CODING = 'coding',
  CUSTOM = 'custom',
}

export class CreateAgentDto {
  @IsString()
  @MinLength(2)
  @MaxLength(60)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  description?: string;

  @IsEnum(AgentFrameworkDto)
  framework!: AgentFrameworkDto;

  @IsString()
  model!: string;

  @IsEnum(SkillTemplate)
  skillTemplate!: SkillTemplate;

  @IsOptional()
  @IsString()
  @MaxLength(10000)
  customSkill?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(2)
  temperature?: number;

  @IsOptional()
  @IsNumber()
  @Min(256)
  @Max(32768)
  maxTokens?: number;
}
