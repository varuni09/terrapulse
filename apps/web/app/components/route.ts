import { NextRequest, NextResponse } from "next/server";

export const maxDuration = 30;

export async function POST(req: NextRequest) {
  try {
    const { question, context } = await req.json();

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: "OPENAI_API_KEY environment variable is not configured." },
        { status: 500 }
      );
    }

    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [
          {
            role: "system",
            content:
              "You are an expert urban climate analyst. Provide concise, clear, and actionable insights based on the user's dataset context.",
          },
          {
            role: "user",
            content: `Context: ${JSON.stringify(context)}\n\nQuestion: ${question}`,
          },
        ],
        temperature: 0.7,
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      return NextResponse.json(
        { error: `OpenAI API returned status ${response.status}: ${errText}` },
        { status: response.status }
      );
    }

    const data = await response.json();
    const answer = data.choices?.[0]?.message?.content || "No briefing generated.";

    return NextResponse.json({ answer });
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || "Internal server error" },
      { status: 500 }
    );
  }
}