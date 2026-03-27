import {
  IsInt,
  IsOptional,
  IsString,
  IsPositive,
  IsNumberString,
} from 'class-validator';

export class CreatePaymentSessionDto {
  @IsInt()
  @IsPositive()
  chainId!: number;

  /**
   * ERC-20 token contract address.
   * Omit for native-token payments.
   */
  @IsOptional()
  @IsString()
  tokenAddress?: string;

  /**
   * Human-readable amount (e.g. "0.005").
   * If omitted, backend uses AGENT_CREATION_PRICE env var.
   */
  @IsOptional()
  @IsNumberString()
  amount?: string;
}
