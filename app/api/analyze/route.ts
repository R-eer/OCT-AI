import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'

const SYSTEM_PROMPT = `You are OCT Vision AI, an expert ophthalmology assistant specializing in OCT (Optical Coherence Tomography) scan analysis. You have extensive knowledge of retinal anatomy, OCT imaging patterns, and ophthalmic pathology.

When analyzing an OCT scan image, provide a structured analysis covering:
1. Scan Type: Identify if this is a macular OCT, optic nerve OCT, retinal thickness map, or other type
2. Image Quality: Comment on scan quality and adequacy
3. Key Findings: List all notable features observed (normal and abnormal)
4. Possible Primary Diagnosis: Most likely condition based on findings
5. Differential Diagnoses: Other possible conditions to consider
6. Educational Notes: Explain the significance of findings in educational terms
7. Recommended Next Steps: Suggest what a clinician might consider

Focus on these conditions when relevant: macular edema, epiretinal membrane (ERM), vitreomacular traction (VMT), macular hole, diabetic retinopathy changes, age-related macular degeneration (AMD) - both dry and wet, subretinal fluid (SRF), intraretinal fluid (IRF), retinal thinning/atrophy, drusen, geographic atrophy, choroidal neovascularization (CNV), retinal detachment, retinoschisis.

Always include a disclaimer that findings are for educational purposes and not a substitute for formal medical evaluation.

Return your analysis as a JSON object with this structure:
{
  "scanType": "string",
  "imageQuality": "Good|Fair|Poor",
  "qualityNote": "string",
  "keyFindings": ["finding1", "finding2", ...],
  "primaryDiagnosis": {
    "condition": "string",
    "confidence": "High|Moderate|Low",
    "rationale": "string"
  },
  "differentialDiagnoses": [
    {"condition": "string", "likelihood": "High|Moderate|Low", "notes": "string"}
  ],
  "educationalNotes": "string",
  "recommendedNextSteps": ["step1", "step2", ...],
  "disclaimer": "string"
}`

export interface AnalysisResult {
  scanType: string
  imageQuality: 'Good' | 'Fair' | 'Poor'
  qualityNote: string
  keyFindings: string[]
  primaryDiagnosis: {
    condition: string
    confidence: 'High' | 'Moderate' | 'Low'
    rationale: string
  }
  differentialDiagnoses: Array<{
    condition: string
    likelihood: 'High' | 'Moderate' | 'Low'
    notes: string
  }>
  educationalNotes: string
  recommendedNextSteps: string[]
  disclaimer: string
}

export async function POST(request: NextRequest) {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    return NextResponse.json(
      { error: 'ANTHROPIC_API_KEY is not configured. Please set this environment variable to use OCT Vision AI.' },
      { status: 500 }
    )
  }

  let formData: FormData
  try {
    formData = await request.formData()
  } catch {
    return NextResponse.json({ error: 'Invalid request: could not parse form data.' }, { status: 400 })
  }

  const file = formData.get('image') as File | null
  if (!file) {
    return NextResponse.json({ error: 'No image provided.' }, { status: 400 })
  }

  const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp']
  if (!allowedTypes.includes(file.type)) {
    return NextResponse.json(
      { error: 'Invalid file type. Please upload a JPEG, PNG, GIF, or WebP image.' },
      { status: 400 }
    )
  }

  const maxSize = 20 * 1024 * 1024 // 20MB
  if (file.size > maxSize) {
    return NextResponse.json({ error: 'Image is too large. Maximum size is 20MB.' }, { status: 400 })
  }

  let base64Image: string
  try {
    const arrayBuffer = await file.arrayBuffer()
    const buffer = Buffer.from(arrayBuffer)
    base64Image = buffer.toString('base64')
  } catch {
    return NextResponse.json({ error: 'Failed to process the image.' }, { status: 500 })
  }

  const client = new Anthropic({ apiKey })

  try {
    const response = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 2048,
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'image',
              source: {
                type: 'base64',
                media_type: file.type as 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp',
                data: base64Image,
              },
            },
            {
              type: 'text',
              text: 'Please analyze this OCT scan image and provide a detailed structured analysis in JSON format as specified.',
            },
          ],
        },
      ],
    })

    const content = response.content[0]
    if (content.type !== 'text') {
      return NextResponse.json({ error: 'Unexpected response from AI model.' }, { status: 500 })
    }

    const text = content.text.trim()

    // Extract JSON from the response (handle markdown code blocks)
    const jsonMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/) || text.match(/(\{[\s\S]*\})/)
    const jsonString = jsonMatch ? (jsonMatch[1] || jsonMatch[0]).trim() : text

    let analysis: AnalysisResult
    try {
      analysis = JSON.parse(jsonString)
    } catch {
      return NextResponse.json(
        { error: 'Failed to parse analysis response. The AI returned an unexpected format.' },
        { status: 500 }
      )
    }

    return NextResponse.json({ analysis })
  } catch (err) {
    const error = err as { status?: number; message?: string }
    if (error.status === 401) {
      return NextResponse.json({ error: 'Invalid API key. Please check your ANTHROPIC_API_KEY.' }, { status: 401 })
    }
    if (error.status === 429) {
      return NextResponse.json({ error: 'Rate limit exceeded. Please wait a moment and try again.' }, { status: 429 })
    }
    const message = error.message || 'An unexpected error occurred during analysis.'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
