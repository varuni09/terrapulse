import { NextRequest, NextResponse } from "next/server";
import { GoogleGenAI } from "@google/genai";

export const maxDuration = 30;

export async function POST(req: NextRequest) {
  try {
    const { question, context } = await req.json();

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: "GEMINI_API_KEY environment variable is not configured." },
        { status: 500 }
      );
    }

    const ai = new GoogleGenAI({ apiKey });

    const prompt = `You are an expert urban climate analyst for TERRAPULSE. Provide concise, clear, and actionable insights based on the provided dataset context.

Dataset Context:
${JSON.stringify(context, null, 2)}

User Question:
${question}`;

    const response = await ai.models.generateContent({
      model: "gemini-3.8-flash",
      contents: prompt,
    });

    const answer = response.text || "No briefing generated.";

    return NextResponse.json({ answer });
  } catch (error: any) {
    console.error("Gemini AI Analyst error:", error);
    return NextResponse.json(
      { error: error?.message || "Internal server error" },
      { status: 500 }
    );
  }
}