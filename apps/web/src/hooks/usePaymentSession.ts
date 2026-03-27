'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { useSendTransaction, useWriteContract, useWaitForTransactionReceipt, useChainId } from 'wagmi';
import { parseUnits, parseAbi, type Address } from 'viem';
import { paymentsApi } from '@/lib/api';

export type SessionStatus =
  | 'idle'
  | 'creating'
  | 'awaiting_payment'
  | 'sending'
  | 'tx_submitted'
  | 'detected'
  | 'confirming'
  | 'confirmed'
  | 'expired'
  | 'error';

export interface PaymentSession {
  id: string;
  walletAddress: string;
  chainId: number;
  chainName: string;
  tokenAddress: string | null;
  tokenSymbol: string;
  tokenDecimals: number;
  expectedAmount: string;
  displayAmount: string;
  purpose: string;
  status: string;
  expiresAt: string;
  treasuryAddress: string;
  blockchainPayment?: {
    txHash: string;
    confirmations: number;
    requiredConfirmations: number;
    confirmedAt: string | null;
  } | null;
}

const ERC20_TRANSFER_ABI = parseAbi([
  'function transfer(address to, uint256 amount) returns (bool)',
]);

const BACKEND_STATUS_MAP: Record<string, SessionStatus> = {
  PENDING: 'awaiting_payment',
  DETECTED: 'detected',
  CONFIRMING: 'confirming',
  CONFIRMED: 'confirmed',
  EXPIRED: 'expired',
  FAILED: 'error',
};

const POLL_INTERVAL_MS = 3_000;

export function usePaymentSession() {
  const connectedChainId = useChainId();

  const [uiStatus, setUiStatus] = useState<SessionStatus>('idle');
  const [session, setSession] = useState<PaymentSession | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [userTxHash, setUserTxHash] = useState<`0x${string}` | undefined>();

  const pollRef = useRef<NodeJS.Timeout | null>(null);

  // wagmi hooks for sending transactions
  const { sendTransactionAsync } = useSendTransaction();
  const { writeContractAsync } = useWriteContract();

  // Watch for the submitted tx to be mined
  const { isSuccess: txMined } = useWaitForTransactionReceipt({
    hash: userTxHash,
    query: { enabled: !!userTxHash },
  });

  // When user's tx is mined, switch to "waiting for backend detection"
  useEffect(() => {
    if (txMined && uiStatus === 'tx_submitted') {
      setUiStatus('awaiting_payment');
    }
  }, [txMined, uiStatus]);

  // ─── Polling ─────────────────────────────────────────────

  const startPolling = useCallback((sessionId: string) => {
    if (pollRef.current) clearInterval(pollRef.current);

    pollRef.current = setInterval(async () => {
      try {
        const updated: PaymentSession = await paymentsApi.getSession(sessionId);
        setSession(updated);

        const mapped = BACKEND_STATUS_MAP[updated.status] ?? 'awaiting_payment';

        // Don't override user-visible "sending/tx_submitted" states
        // unless backend has actually moved forward
        if (mapped !== 'awaiting_payment' || uiStatus === 'awaiting_payment') {
          setUiStatus(mapped);
        }

        if (
          updated.status === 'CONFIRMED' ||
          updated.status === 'EXPIRED' ||
          updated.status === 'FAILED'
        ) {
          clearInterval(pollRef.current!);
          pollRef.current = null;
        }
      } catch (err: any) {
        console.error('[usePaymentSession] poll error:', err.message);
      }
    }, POLL_INTERVAL_MS);
  }, [uiStatus]);

  const stopPolling = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, []);

  useEffect(() => () => stopPolling(), [stopPolling]);

  // ─── Create session ───────────────────────────────────────

  const createSession = useCallback(
    async (params: {
      purpose: 'AGENT_CREATION' | 'CREDIT_TOPUP';
      chainId: number;
      tokenAddress?: string;
      amount?: string;
    }) => {
      setUiStatus('creating');
      setError(null);
      setSession(null);
      setUserTxHash(undefined);

      try {
        const data: PaymentSession = await paymentsApi.createSession({
          purpose: params.purpose,
          chainId: params.chainId,
          tokenAddress: params.tokenAddress,
          amount: params.amount,
        });

        setSession(data);
        setUiStatus('awaiting_payment');
        startPolling(data.id);
        return data;
      } catch (err: any) {
        const msg = err.response?.data?.message ?? err.message ?? 'Failed to create payment session';
        setError(msg);
        setUiStatus('error');
        return null;
      }
    },
    [startPolling],
  );

  // ─── Send payment from wallet ─────────────────────────────

  const sendPayment = useCallback(async () => {
    if (!session) return;

    setUiStatus('sending');
    setError(null);

    const treasury = session.treasuryAddress as Address;
    const amountBigInt = BigInt(session.expectedAmount);

    try {
      let hash: `0x${string}`;

      if (!session.tokenAddress) {
        // Native token (ETH / MATIC / etc)
        hash = await sendTransactionAsync({
          to: treasury,
          value: amountBigInt,
          chainId: session.chainId,
        });
      } else {
        // ERC-20 Transfer
        hash = await writeContractAsync({
          address: session.tokenAddress as Address,
          abi: ERC20_TRANSFER_ABI,
          functionName: 'transfer',
          args: [treasury, amountBigInt],
          chainId: session.chainId,
        });
      }

      setUserTxHash(hash);
      setUiStatus('tx_submitted');
    } catch (err: any) {
      const msg =
        err.shortMessage ?? err.message ?? 'Transaction rejected or failed';
      setError(msg);
      setUiStatus('awaiting_payment'); // allow retry
    }
  }, [session, sendTransactionAsync, writeContractAsync]);

  // ─── Reset ────────────────────────────────────────────────

  const reset = useCallback(() => {
    stopPolling();
    setUiStatus('idle');
    setSession(null);
    setError(null);
    setUserTxHash(undefined);
  }, [stopPolling]);

  return {
    uiStatus,
    session,
    error,
    userTxHash,
    connectedChainId,
    createSession,
    sendPayment,
    reset,
  };
}
