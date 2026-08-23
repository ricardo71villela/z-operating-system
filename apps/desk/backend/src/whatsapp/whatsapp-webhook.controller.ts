import { Body, Controller, Get, Post, Query } from '@nestjs/common';

/**
 * Meta WhatsApp Business Cloud API webhook.
 * GET  — verification handshake required by Meta on setup.
 * POST — incoming message/status events, enqueued for async processing (BullMQ).
 *
 * Business logic (thread matching, AI triage) is intentionally not implemented
 * yet — this is the foundation branch. See apps/desk/README.md for the pipeline.
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
  receive(@Body() payload: unknown) {
    // TODO: enqueue payload onto the sync worker queue (BullMQ) instead of
    // processing inline — webhooks must respond immediately.
    return { received: true };
  }
}
