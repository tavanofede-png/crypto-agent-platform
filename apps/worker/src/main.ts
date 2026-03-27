import 'dotenv/config';
import { Worker, QueueEvents } from 'bullmq';
import { AgentProcessor } from './workers/agent.processor';

const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';

const connection = {
  url: REDIS_URL,
};

async function bootstrap() {
  console.log('🔄 Worker starting...');

  const processor = new AgentProcessor();
  await processor.init();

  const worker = new Worker('agents', processor.process.bind(processor), {
    connection,
    concurrency: 5,
    removeOnComplete: { count: 100 },
    removeOnFail: { count: 50 },
  });

  const queueEvents = new QueueEvents('agents', { connection });

  worker.on('completed', (job) => {
    console.log(`✅ Job ${job.id} [${job.name}] completed`);
  });

  worker.on('failed', (job, err) => {
    console.error(`❌ Job ${job?.id} [${job?.name}] failed: ${err.message}`);
  });

  worker.on('active', (job) => {
    console.log(`🏃 Job ${job.id} [${job.name}] started`);
  });

  process.on('SIGTERM', async () => {
    console.log('SIGTERM received, closing worker...');
    await worker.close();
    process.exit(0);
  });

  process.on('SIGINT', async () => {
    await worker.close();
    process.exit(0);
  });

  console.log('✅ Worker ready, listening on queue: agents');
}

bootstrap().catch((err) => {
  console.error('Worker failed to start:', err);
  process.exit(1);
});
