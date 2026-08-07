import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { LoyaltyService } from './loyalty.service';
import { LOYALTY_CRON_JOB, LOYALTY_QUEUE } from './loyalty.types';

@Processor(LOYALTY_QUEUE)
export class LoyaltyProcessor extends WorkerHost {
  private readonly logger = new Logger(LoyaltyProcessor.name);

  constructor(private readonly loyaltyService: LoyaltyService) {
    super();
  }

  async process(job: Job): Promise<void> {
    if (job.name !== LOYALTY_CRON_JOB) return;
    const result = await this.loyaltyService.completeOverdueBookings();
    this.logger.log(JSON.stringify({ job: job.name, ...result }));
  }
}
