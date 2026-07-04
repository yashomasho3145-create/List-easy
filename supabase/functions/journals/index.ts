import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { buildCors } from '../_shared/cors.ts';

const supabaseClient = () =>
  createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

interface Journal {
  id: string;
  user_id: string;
  date: string;
  title: string;
  content: string;
  tasks_completed_count: number | null;
  completed_tasks: unknown;
  created_at: string;
  updated_at: string;
}

function groupByMonth(journals: Journal[]) {
  const groups: Record<string, { year: number; month: number; label: string; journals: Journal[] }> = {};

  for (const j of journals) {
    const [year, month] = j.date.split('-').map(Number);
    const key = `${year}-${String(month).padStart(2, '0')}`;
    if (!groups[key]) {
      groups[key] = {
        year,
        month,
        label: `${year}年${month}月`,
        journals: [],
      };
    }
    groups[key].journals.push(j);
  }

  return Object.values(groups).sort((a, b) => {
    if (a.year !== b.year) return b.year - a.year;
    return b.month - a.month;
  });
}

Deno.serve(async (req: Request) => {
  const { corsResponse, jsonResponse, errorResponse } = buildCors(req.headers.get('origin'));
  if (req.method === 'OPTIONS') return corsResponse();

  try {
    const supabase = supabaseClient();
    const url = new URL(req.url);
    const path = url.pathname.replace(/\/$/, '');

    // GET /journals
    if (req.method === 'GET') {
      const user_id = url.searchParams.get('user_id');
      if (!user_id) return errorResponse('user_id is required', 400);

      const { data: journals, error } = await supabase
        .from('journals')
        .select('*')
        .eq('user_id', user_id)
        .order('date', { ascending: false })
        .order('created_at', { ascending: false }); // 同日内は新しいものが上

      if (error) return errorResponse(error.message, 500);

      const grouped = groupByMonth(journals ?? []);
      return jsonResponse({ journals: journals ?? [], grouped });
    }

    // POST /journals/save
    if (req.method === 'POST' && path.endsWith('/save')) {
      const body = await req.json();
      const { user_id, date, title, content, tasks_completed_count, completed_tasks } = body;
      if (!user_id || !date) return errorResponse('user_id and date are required', 400);

      const { data, error } = await supabase
        .from('journals')
        .insert({
          user_id,
          date,
          title: title ?? '',
          content: content ?? '',
          tasks_completed_count: tasks_completed_count ?? null,
          completed_tasks: completed_tasks ?? null,
        })
        .select('*')
        .single();

      if (error) return errorResponse(error.message, 500);
      return jsonResponse(data);
    }

    // POST /journals/update
    if (req.method === 'POST' && path.endsWith('/update')) {
      const body = await req.json();
      const { id, user_id, title, content, is_favorite } = body;
      if (!id || !user_id) return errorResponse('id and user_id are required', 400);

      // 渡されたフィールドだけを更新（お気に入りトグルで本文を壊さない）
      const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
      if (title !== undefined) patch.title = title;
      if (content !== undefined) patch.content = content;
      if (is_favorite !== undefined) patch.is_favorite = !!is_favorite;

      const { data, error } = await supabase
        .from('journals')
        .update(patch)
        .eq('id', id)
        .eq('user_id', user_id)
        .select('*')
        .single();

      if (error) return errorResponse(error.message, 500);
      return jsonResponse(data);
    }

    // POST /journals/delete
    if (req.method === 'POST' && path.endsWith('/delete')) {
      const body = await req.json();
      const { id, user_id } = body;
      if (!id || !user_id) return errorResponse('id and user_id are required', 400);

      const { error } = await supabase
        .from('journals')
        .delete()
        .eq('id', id)
        .eq('user_id', user_id);

      if (error) return errorResponse(error.message, 500);
      return jsonResponse({ success: true });
    }

    return errorResponse('Not found', 404);
  } catch (e) {
    return errorResponse(String(e), 500);
  }
});
