import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { createClient } from '@supabase/supabase-js';

// Incoming Lead Payload Interface
export interface IncomingLeadPayload {
  name: string;
  phone: string;
  source: string;
  message?: string;
}

/**
 * Sentinel-X Cryptographic Shield: HMAC SHA256 Verification
 * Verifies that the raw request body matches the signature provided in headers.
 */
function verifySentinelSignature(rawBody: string, signatureHeader: string | null, secret: string): boolean {
  if (!signatureHeader || !secret) {
    return false;
  }

  // Extract hash if prefix like 'sha256=' is used
  const cleanSignature = signatureHeader.replace(/^sha256=/, '').trim();

  const expectedHmac = crypto
    .createHmac('sha256', secret)
    .update(rawBody)
    .digest('hex');

  try {
    const sigBuffer = Buffer.from(cleanSignature, 'hex');
    const hmacBuffer = Buffer.from(expectedHmac, 'hex');

    if (sigBuffer.length !== hmacBuffer.length) {
      return false;
    }

    return crypto.timingSafeEqual(sigBuffer, hmacBuffer);
  } catch (err) {
    console.error('Cryptographic signature verification error:', err);
    return false;
  }
}

/**
 * Data Poisoning Defense: XSS HTML Entity Neutralization
 * Neutralizes HTML tags (< and >) while preserving full Unicode (foreign names, emojis, punctuation).
 */
function sanitizeInput(str: string, maxLength: number = 500): string {
  if (!str) return '';
  return str
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .trim()
    .slice(0, maxLength);
}

export async function POST(req: NextRequest) {
  try {
    const webhookSecret = process.env.WEBHOOK_SECRET;
    if (!webhookSecret) {
      console.error('Sentinel-X Shield Alert: WEBHOOK_SECRET is not configured.');
      return NextResponse.json(
        { success: false, error: 'Cryptographic shield misconfiguration.' },
        { status: 500 }
      );
    }

    // Read raw body for HMAC verification before JSON parsing
    const rawBody = await req.text();
    const signatureHeader =
      req.headers.get('x-sentinel-signature') ||
      req.headers.get('x-hub-signature-256') ||
      req.headers.get('x-signature');

    // 1. Sentinel-X Cryptographic Verification
    const isValidSignature = verifySentinelSignature(rawBody, signatureHeader, webhookSecret);
    if (!isValidSignature) {
      console.warn('Sentinel-X Shield Alert: Hostile/Unsigned payload dropped.', {
        ip: req.headers.get('x-forwarded-for') || 'unknown',
      });
      return NextResponse.json(
        { success: false, error: 'Unauthorized payload. Signature mismatch.' },
        { status: 401 }
      );
    }

    // 2. Parse & Sanitize Data
    let unparsedPayload: IncomingLeadPayload;
    try {
      unparsedPayload = JSON.parse(rawBody);
    } catch {
      return NextResponse.json(
        { success: false, error: 'Malformed JSON payload.' },
        { status: 400 }
      );
    }

    if (!unparsedPayload.name || !unparsedPayload.phone) {
      return NextResponse.json(
        { success: false, error: 'Missing mandatory lead fields (name, phone).' },
        { status: 400 }
      );
    }

    const sanitizedLead = {
      name: sanitizeInput(unparsedPayload.name, 100),
      phone: sanitizeInput(unparsedPayload.phone, 30),
      source: sanitizeInput(unparsedPayload.source || 'WEBHOOK', 50),
      message: sanitizeInput(unparsedPayload.message || '', 500),
      status: 'REQUIRES_HUMAN_TRIAGE',
      created_at: new Date().toISOString(),
    };

    // 3. Supabase Server-Side Database Ingestion (Strict Service Role Key Enforcement)
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !supabaseKey) {
      console.error('Database Alert: SUPABASE_SERVICE_ROLE_KEY is missing.');
      return NextResponse.json(
        { success: false, error: 'Secure database connection misconfiguration.' },
        { status: 500 }
      );
    }

    const supabase = createClient(supabaseUrl, supabaseKey);

    const { data, error: dbError } = await supabase
      .from('leads')
      .insert([sanitizedLead])
      .select('id, name, status, created_at');

    if (dbError) {
      console.error('Supabase Ingestion Error:', dbError);
      return NextResponse.json(
        { success: false, error: 'Failed to record lead into isolated database.' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: 'Lead verified, sanitized, and ingested into Sentinel-X isolation buffer.',
      lead: data?.[0] || null,
    });
  } catch (error: any) {
    console.error('Aura OS Ingest Pipeline Error:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Fatal Ingestion Error' },
      { status: 500 }
    );
  }
}
