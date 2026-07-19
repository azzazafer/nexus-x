import { NextRequest, NextResponse } from 'next/server';
import { huntClinicBottlenecks } from '@/lib/bottleneck-scraper';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const query = searchParams.get('q') || 'Ankara diş kliniği';

    const apiKey = process.env.GOOGLE_PLACES_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { success: false, error: 'GOOGLE_PLACES_API_KEY environment variable is not configured.' },
        { status: 500 }
      );
    }

    const bottleneckClinics = await huntClinicBottlenecks(query, apiKey);

    return NextResponse.json({
      success: true,
      query,
      count: bottleneckClinics.length,
      clinics: bottleneckClinics,
    });
  } catch (error: any) {
    console.error('Trojan Scraper Error:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Internal Scraper Error' },
      { status: 500 }
    );
  }
}
