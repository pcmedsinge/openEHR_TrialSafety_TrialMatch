import OpenAI from 'openai';

const client = new OpenAI({
  apiKey: import.meta.env.VITE_OPENAI_API_KEY as string,
  dangerouslyAllowBrowser: true,
});

const SYSTEM_PROMPT = `You are a pharmacovigilance specialist writing ICH E2B-compliant safety narratives for clinical trials.

You will be given a table of adverse events. Write a factual 3-4 paragraph narrative covering:
1. Trial context and affected participants
2. Event description — name, severity, onset date
3. Temporal pattern and clinical significance
4. Recommended pharmacovigilance action

Be concise and factual. Do not invent data not provided.`;

export async function generateSafetyNarrative(
  signals: { participantId: string; visitDate: string; aeName: string; severity: string }[],
  signalWindow: { from: string; to: string },
  onChunk: (text: string) => void
): Promise<void> {
  const table = signals
    .map(s => `  ${s.participantId} | ${s.visitDate.slice(0, 10)} | ${s.aeName} | ${s.severity}`)
    .join('\n');

  const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
    { role: 'system', content: SYSTEM_PROMPT },
    {
      role: 'user',
      content: `Generate an ICH E2B safety narrative for the following pharmacovigilance signal.

Signal window: ${signalWindow.from} to ${signalWindow.to}
Signal: Co-occurring Moderate Fatigue and Headache at Week 8 of trial

Adverse event data (Participant | Visit Date | Event | Severity):
${table}

Write the complete safety narrative now.`,
    },
  ];

  const stream = await client.chat.completions.create({
    model: 'gpt-4o',
    messages,
    stream: true,
  });

  for await (const chunk of stream) {
    const content = chunk.choices[0]?.delta?.content;
    if (content) onChunk(content);
  }
}
