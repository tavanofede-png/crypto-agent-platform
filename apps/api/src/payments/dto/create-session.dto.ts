import {
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsPositive,
  IsNumberString,
} from 'class-validator';
import { PaymentPurpose } from '@prisma/client';

export class CreatePaymentSessionDto {
  @IsEnum(PaymentPurpose)
  purpose!: PaymentPurpose;

  @IsInt()
  @IsPositive()
  chainId!: number;

  /**
   * ERC-20 token contract address.
   * Pass null / omit to request a native-token payment.
   */
  @IsOptional()
  @IsString()
  tokenAddress?: string;

  /**
   * Human-readable amount (e.g. "5.00").
   * The backend resolves the expected wei amount from this.
   * If omitted, a default amount is computed based on purpose.
   */
  @IsOptional()
  @IsNumberString()
  amount?: string;
}
