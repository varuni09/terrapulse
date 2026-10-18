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

    const prompt = `You are a scientific urban climate analyst for TERRAPULSE. 
Answer strictly based on the provided context data.

Rules:
1. Always include a "Data Provenance" section listing exact data points used (e.g. Mean LST, Ward IDs, NDVI values).
2. Always include a "Limitations & What I Cannot Answer" section if asked about real-time indoor temps, micro-level future weather predictions, or unmeasured metrics.

Context Data:
${JSON.stringify(context, null, 2)}

User Question:
${question}`;

    const response = await ai.models.generateContent({
      model: "gemini-3.8-flash",
      contents: prompt,
    });

    const answer = response.text || "No briefing generated.";

    return NextResponse.json({
      answer,
      provenance: {
        dataSourcesUsed: ["Earth Engine MODIS/Landsat Composites", "IMD Air Temp Baseline"],
        metricsApplied: Object.keys(context || {}),
      },
    });
  } catch (error: any) {
    console.error("Gemini AI Analyst error:", error);
    return NextResponse.json(
      { error: error?.message || "Internal server error" },
      { status: 500 }
    );
  }
}