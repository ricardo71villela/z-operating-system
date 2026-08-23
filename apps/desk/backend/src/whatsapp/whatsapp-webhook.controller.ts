import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { inboundMessageQueue } from '../queues/queues';

/**
 * Meta WhatsApp Business Cloud API webhook.
 * GET  — verification handshake required by Meta on setup.
 * POST — incoming message/status events, enqueued for async processing.
 *
 * Tenant/thread resolution and AI triage happen in the queue worker
 * (see queues/workers/inbound-message.worker.ts), not here — webhook
 * handlers must return fast, well within Meta's response window.
 */
@Controller('webhooks/whatsapp')
export class WhatsappWebhookController {
  @Get()
  verify(
    @Query('hub.mode') mode: string,
    @Query('hub.verify_token') token: string,
    @Query('hub.challenge') challenge: string,
  ) {
    if (mode === 'subscribe' && token === process.env.WHATSAPP_VERIFY_TOKEN) {
      return challenge;
    }
    return 'forbidden';
  }

  @Post()
  async receive(@Body() payload: unknown) {
    await inboundMessageQueue.add('whatsapp', {
      channel: 'whatsapp',
      payload,
      receivedAt: new Date().toISOString(),
    });
    return { received: true };
  }
}
