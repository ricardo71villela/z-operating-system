import { Body, Controller, Param, Post } from '@nestjs/common';
import { deskAdmin } from '../supabase/supabase-admin';
import { RequireDeskAuth } from '../auth/desk-auth.decorators';

@RequireDeskAuth()
@Controller('messages')
export class MessagesController {
  @Post(':id/resolve')
  async resolve(@Param('id') id: string, @Body('workspaceId') workspaceId: string) {
    const { error } = await deskAdmin
      .from('messages')
      .update({ state: 'resolved' })
      .eq('id', id)
      .eq('workspace_id', workspaceId);
    if (error) throw error;
    return { resolved: true };
  }
}
