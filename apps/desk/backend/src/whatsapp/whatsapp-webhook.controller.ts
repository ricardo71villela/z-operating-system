import { Body, Controller, ForbiddenException, Get, Headers, Post, Query, Req } from '@nestjs/common';
import type { Request } from 'express';
import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import { parseWhatsappMessage } from './parse-whatsapp-payload';

function verifyWebhookSignature(rawBody: Buffer | undefined, signatureHeader: string | undefined): void {
  const secret = process.env.WHATSAPP_APP_SECRET;
  if (!secret) throw new Error('WHATSAPP_APP_SECRET is required before WhatsApp webhook activation.');
  if (!rawBody || !signatureHeader?.startsWith('sha256=')) {
    throw new ForbiddenException('Missing WhatsApp webhook signature.');
  }

  const suppliedHex = signatureHeader.slice('sha256='.length).toLowerCase();
  if (!/^[a-f0-9]{64}$/.test(suppliedHex)) throw new ForbiddenException('Invalid WhatsApp webhook signature.');

  const expected = createHmac('sha256', secret).update(rawBody).digest();
  const supplied = Buffer.from(suppliedHex, 'hex');
  if (expected.length !== supplied.length || !timingSafeEqual(expected, supplied)) {
    throw new ForbiddenException('Invalid WhatsApp webhook signature.');
  }
}

function inboundJobId(externalMessageId: string): string {
  return `whatsapp-${createHash('sha256').update(externalMessageId, 'utf8').digest('hex')}`;
}

@Controller('webhooks/whatsapp')
export class WhatsappWebhookController {
  @Get()
  verify(
    @Query('hub.mode') mode: string,
    @Query('hub.verify_token') token: string,
    @Query('hub.challenge') challenge: string,
  ) {
    const expectedToken = process.env.WHATSAPP_VERIFY_TOKEN;
    if (!expectedToken || mode !== 'subscribe' || token !== expectedToken) {
      throw new ForbiddenException('WhatsApp webhook verification failed.');
    }
    return challenge;
  }

  @Post()
  async receive(
    @Req() req: Request & { rawBody?: Buffer },
    @Headers('x-hub-signature-256') signature: string | undefined,
    @Body() payload: unknown,
  ) {
    verifyWebhookSignature(req.rawBody, signature);

    const parsed = parseWhatsappMessage(payload);
    if (!parsed) return { accepted: true, queued: false };

    // Queue import is deliberately lazy: mounting the signed webhook does not
    // open Redis while D3 background workers remain disabled.
    const { inboundMessageQueue } = await import('../queues/queues');
    await inboundMessageQueue.add(
      'whatsapp-inbound',
      { channel: 'whatsapp', payload, receivedAt: new Date().toISOString() },
      {
        jobId: inboundJobId(parsed.externalMessageId),
        removeOnComplete: 1000,
        removeOnFail: 5000,
      },
    );

    return { accepted: true, queued: true };
  }
}
