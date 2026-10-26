import { serve } from '@hono/node-server';
import { createApp } from './app.ts';
import { reminderText } from './commands.ts';
import { config } from './config.ts';
import { takeDueReminders } from './status.ts';
import { sendText } from './whatsapp.ts';

serve({ fetch: createApp().fetch, port: config.port }, ({ port }) => {
  console.log(`condobot ouvindo na porta ${port}`);
});

// Avisa quem registrou a manutenção quando a previsão vence e a área continua marcada.
// Texto livre só chega se a pessoa falou com o bot nas últimas 24h; fora disso, precisará de template.
setInterval(async () => {
  for (const s of takeDueReminders()) {
    await sendText(s.updatedBy, reminderText(s.area, s.untilLabel)).catch((err) =>
      console.error('erro ao enviar lembrete de manutenção', s.area, err),
    );
  }
}, 10 * 60_000);
