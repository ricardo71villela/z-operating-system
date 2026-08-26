import { Module } from '@nestjs/common';
import { WhatsappWebhookController } from './whatsapp-webhook.controller';

@Module({
  controllers: [WhatsappWebhookController],
})
export class WhatsappModule {}
