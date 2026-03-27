-- CreateEnum
CREATE TYPE "AgentStatus" AS ENUM ('PROVISIONING', 'RUNNING', 'STOPPED', 'ERROR', 'DELETED');

-- CreateEnum
CREATE TYPE "AgentFramework" AS ENUM ('OPENCLAW', 'ZEROCLAW');

-- CreateEnum
CREATE TYPE "LogLevel" AS ENUM ('DEBUG', 'INFO', 'WARN', 'ERROR');

-- CreateEnum
CREATE TYPE "OrderStatus" AS ENUM ('AWAITING_PAYMENT', 'PAYMENT_DETECTED', 'PAYMENT_CONFIRMED', 'PROVISIONING', 'COMPLETED', 'FAILED');

-- CreateEnum
CREATE TYPE "PaymentSessionStatus" AS ENUM ('PENDING', 'DETECTED', 'CONFIRMING', 'CONFIRMED', 'EXPIRED', 'FAILED');

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "wallet_address" TEXT NOT NULL,
    "nonce" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "agents" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "framework" "AgentFramework" NOT NULL DEFAULT 'ZEROCLAW',
    "model" TEXT NOT NULL DEFAULT 'gpt-4o',
    "status" "AgentStatus" NOT NULL DEFAULT 'PROVISIONING',
    "workspace_path" TEXT,
    "system_prompt" TEXT,
    "temperature" DOUBLE PRECISION NOT NULL DEFAULT 0.7,
    "max_tokens" INTEGER NOT NULL DEFAULT 2048,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "agents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "skills" (
    "id" TEXT NOT NULL,
    "agent_id" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "template" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "skills_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "chat_sessions" (
    "id" TEXT NOT NULL,
    "agent_id" TEXT NOT NULL,
    "title" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "chat_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "chat_messages" (
    "id" TEXT NOT NULL,
    "session_id" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "tokens_used" INTEGER,
    "duration_ms" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "chat_messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "agent_logs" (
    "id" TEXT NOT NULL,
    "agent_id" TEXT NOT NULL,
    "level" "LogLevel" NOT NULL DEFAULT 'INFO',
    "message" TEXT NOT NULL,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "agent_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "agent_creation_orders" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "status" "OrderStatus" NOT NULL DEFAULT 'AWAITING_PAYMENT',
    "agent_name" TEXT NOT NULL,
    "agent_description" TEXT,
    "framework" "AgentFramework" NOT NULL,
    "model" TEXT NOT NULL,
    "skill_template" TEXT NOT NULL,
    "skill_content" TEXT NOT NULL,
    "temperature" DOUBLE PRECISION NOT NULL DEFAULT 0.7,
    "max_tokens" INTEGER NOT NULL DEFAULT 2048,
    "price_amount" TEXT NOT NULL,
    "price_token" TEXT NOT NULL,
    "price_chain_id" INTEGER NOT NULL,
    "agent_id" TEXT,
    "tx_hash" TEXT,
    "failed_reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "agent_creation_orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payment_sessions" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "wallet_address" TEXT NOT NULL,
    "chain_id" INTEGER NOT NULL,
    "token_address" TEXT,
    "token_symbol" TEXT NOT NULL,
    "token_decimals" INTEGER NOT NULL DEFAULT 18,
    "expected_amount" TEXT NOT NULL,
    "display_amount" TEXT NOT NULL,
    "status" "PaymentSessionStatus" NOT NULL DEFAULT 'PENDING',
    "expires_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "order_id" TEXT,

    CONSTRAINT "payment_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "blockchain_payments" (
    "id" TEXT NOT NULL,
    "session_id" TEXT NOT NULL,
    "tx_hash" TEXT NOT NULL,
    "block_number" INTEGER NOT NULL,
    "chain_id" INTEGER NOT NULL,
    "from_address" TEXT NOT NULL,
    "to_address" TEXT NOT NULL,
    "token_address" TEXT,
    "amount_received" TEXT NOT NULL,
    "confirmations" INTEGER NOT NULL DEFAULT 0,
    "confirmed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "blockchain_payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "processed_chain_events" (
    "id" TEXT NOT NULL,
    "chain_id" INTEGER NOT NULL,
    "tx_hash" TEXT NOT NULL,
    "log_index" INTEGER,
    "event_type" TEXT NOT NULL,
    "processed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "processed_chain_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_wallet_address_key" ON "users"("wallet_address");

-- CreateIndex
CREATE INDEX "agents_user_id_idx" ON "agents"("user_id");

-- CreateIndex
CREATE INDEX "agents_status_idx" ON "agents"("status");

-- CreateIndex
CREATE UNIQUE INDEX "skills_agent_id_key" ON "skills"("agent_id");

-- CreateIndex
CREATE INDEX "chat_sessions_agent_id_idx" ON "chat_sessions"("agent_id");

-- CreateIndex
CREATE INDEX "chat_messages_session_id_idx" ON "chat_messages"("session_id");

-- CreateIndex
CREATE INDEX "agent_logs_agent_id_idx" ON "agent_logs"("agent_id");

-- CreateIndex
CREATE INDEX "agent_logs_created_at_idx" ON "agent_logs"("created_at");

-- CreateIndex
CREATE UNIQUE INDEX "agent_creation_orders_agent_id_key" ON "agent_creation_orders"("agent_id");

-- CreateIndex
CREATE INDEX "agent_creation_orders_user_id_idx" ON "agent_creation_orders"("user_id");

-- CreateIndex
CREATE INDEX "agent_creation_orders_status_idx" ON "agent_creation_orders"("status");

-- CreateIndex
CREATE UNIQUE INDEX "payment_sessions_order_id_key" ON "payment_sessions"("order_id");

-- CreateIndex
CREATE INDEX "payment_sessions_wallet_address_chain_id_status_idx" ON "payment_sessions"("wallet_address", "chain_id", "status");

-- CreateIndex
CREATE INDEX "payment_sessions_status_expires_at_idx" ON "payment_sessions"("status", "expires_at");

-- CreateIndex
CREATE UNIQUE INDEX "blockchain_payments_session_id_key" ON "blockchain_payments"("session_id");

-- CreateIndex
CREATE UNIQUE INDEX "blockchain_payments_tx_hash_key" ON "blockchain_payments"("tx_hash");

-- CreateIndex
CREATE INDEX "blockchain_payments_chain_id_block_number_idx" ON "blockchain_payments"("chain_id", "block_number");

-- CreateIndex
CREATE INDEX "blockchain_payments_chain_id_tx_hash_idx" ON "blockchain_payments"("chain_id", "tx_hash");

-- CreateIndex
CREATE UNIQUE INDEX "processed_chain_events_chain_id_tx_hash_log_index_key" ON "processed_chain_events"("chain_id", "tx_hash", "log_index");

-- CreateIndex
CREATE INDEX "processed_chain_events_chain_id_tx_hash_idx" ON "processed_chain_events"("chain_id", "tx_hash");

-- AddForeignKey
ALTER TABLE "agents" ADD CONSTRAINT "agents_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "skills" ADD CONSTRAINT "skills_agent_id_fkey" FOREIGN KEY ("agent_id") REFERENCES "agents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chat_sessions" ADD CONSTRAINT "chat_sessions_agent_id_fkey" FOREIGN KEY ("agent_id") REFERENCES "agents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chat_messages" ADD CONSTRAINT "chat_messages_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "chat_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agent_logs" ADD CONSTRAINT "agent_logs_agent_id_fkey" FOREIGN KEY ("agent_id") REFERENCES "agents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agent_creation_orders" ADD CONSTRAINT "agent_creation_orders_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agent_creation_orders" ADD CONSTRAINT "agent_creation_orders_agent_id_fkey" FOREIGN KEY ("agent_id") REFERENCES "agents"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_sessions" ADD CONSTRAINT "payment_sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_sessions" ADD CONSTRAINT "payment_sessions_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "agent_creation_orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "blockchain_payments" ADD CONSTRAINT "blockchain_payments_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "payment_sessions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
