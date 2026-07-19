export interface BadReview {
  authorName: string;
  rating: number;
  text: string;
  relativeTime: string;
}

export interface ClinicBottleneckData {
  placeId: string;
  name: string;
  address: string;
  rating: number;
  totalReviews: number;
  hasWebsite: boolean;
  websiteUrl: string | null;
  badReviews: BadReview[];
  bottlenecks: string[];
}

export async function huntClinicBottlenecks(
  query: string,
  apiKey: string = process.env.GOOGLE_PLACES_API_KEY || ''
): Promise<ClinicBottleneckData[]> {
  if (!apiKey) {
    throw new Error('GOOGLE_PLACES_API_KEY is missing from environment variables.');
  }

  const searchUrl = `https://maps.googleapis.com/maps/api/place/textsearch/json?query=${encodeURIComponent(query)}&key=${apiKey}`;
  const searchRes = await fetch(searchUrl);
  const searchData = await searchRes.json();

  if (searchData.status !== 'OK' && searchData.status !== 'ZERO_RESULTS') {
    throw new Error(`Google Places API Error: ${searchData.status} - ${searchData.error_message || ''}`);
  }

  const targetPlaces = (searchData.results || []).slice(0, 10);

  const clinicsData = await Promise.all(
    targetPlaces.map(async (place: any): Promise<ClinicBottleneckData | null> => {
      try {
        const detailsUrl = `https://maps.googleapis.com/maps/api/place/details/json?place_id=${place.place_id}&fields=name,formatted_address,rating,user_ratings_total,website,reviews&key=${apiKey}`;
        const detailsRes = await fetch(detailsUrl);
        const detailsData = await detailsRes.json();

        if (detailsData.status !== 'OK') return null;

        const details = detailsData.result || {};
        const name = details.name || place.name || 'Bilinmeyen Klinik';
        const address = details.formatted_address || place.formatted_address || '';
        const rating = details.rating || place.rating || 0;
        const totalReviews = details.user_ratings_total || place.user_ratings_total || 0;
        const websiteUrl = details.website || null;
        const hasWebsite = Boolean(websiteUrl);

        const rawReviews = details.reviews || [];
        const badReviews: BadReview[] = rawReviews
          .filter((rev: any) => rev.rating <= 2)
          .map((rev: any) => ({
            authorName: rev.author_name || 'Anonim',
            rating: rev.rating,
            text: rev.text || '',
            relativeTime: rev.relative_time_description || '',
          }));

        const bottlenecks: string[] = [];
        if (!hasWebsite) bottlenecks.push('NO_WEBSITE: Kliniğin aktif bir web sitesi bulunmuyor.');
        if (rating < 4.5 && rating > 0) bottlenecks.push(`LOW_RATING: Ortalama puan düşüklüğü (${rating}/5.0).`);
        if (badReviews.length > 0) bottlenecks.push(`UNRESOLVED_BAD_REVIEWS: ${badReviews.length} adet 1-2 yıldızlı olumsuz hasta yorumu mevcut.`);

        if (bottlenecks.length > 0) {
          return {
            placeId: place.place_id,
            name,
            address,
            rating,
            totalReviews,
            hasWebsite,
            websiteUrl,
            badReviews,
            bottlenecks,
          };
        }
        return null;
      } catch (err) {
        console.error(`Error processing place_id ${place.place_id}:`, err);
        return null;
      }
    })
  );

  return clinicsData.filter((clinic): clinic is ClinicBottleneckData => clinic !== null);
}
