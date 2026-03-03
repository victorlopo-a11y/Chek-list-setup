alter table public.checklists
  add column if not exists signature_requests jsonb not null default '{"leader":{"token":"","signedAt":null,"signerName":""},"monitor":{"token":"","signedAt":null,"signerName":""}}'::jsonb,
  add column if not exists leader_signature text,
  add column if not exists monitor_signature text,
  add column if not exists leader_signed_at timestamptz,
  add column if not exists monitor_signed_at timestamptz;

update public.checklists
set signature_requests = coalesce(
  signature_requests,
  '{"leader":{"token":"","signedAt":null,"signerName":""},"monitor":{"token":"","signedAt":null,"signerName":""}}'::jsonb
)
where signature_requests is null;

create or replace function public.sign_checklist_by_token(
  p_checklist_id uuid,
  p_role text,
  p_token text,
  p_signature text,
  p_signer_name text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role text;
  v_signed_at timestamptz := now();
  v_result uuid;
  v_request jsonb;
begin
  v_role := lower(trim(p_role));

  if v_role not in ('leader', 'monitor') then
    raise exception 'invalid signature role';
  end if;

  if coalesce(trim(p_token), '') = '' then
    raise exception 'missing signature token';
  end if;

  if coalesce(trim(p_signature), '') = '' then
    raise exception 'missing signature content';
  end if;

  select
    case
      when v_role = 'leader' then signature_requests -> 'leader'
      else signature_requests -> 'monitor'
    end
  into v_request
  from public.checklists
  where id = p_checklist_id;

  if v_request is null or coalesce(v_request ->> 'token', '') <> p_token then
    raise exception 'invalid or expired signature token';
  end if;

  if coalesce(v_request ->> 'signedAt', '') <> '' then
    raise exception 'signature already signed';
  end if;

  if v_role = 'leader' then
    update public.checklists
    set
      leader_signature = p_signature,
      leader_signed_at = v_signed_at,
      signatures = coalesce(signatures, '{}'::jsonb) || jsonb_build_object('leaderSignature', p_signature),
      signature_requests = jsonb_set(
        coalesce(signature_requests, '{}'::jsonb),
        '{leader}',
        coalesce(signature_requests -> 'leader', '{}'::jsonb) ||
        jsonb_build_object('token', '', 'signedAt', v_signed_at, 'signerName', coalesce(p_signer_name, signature_requests -> 'leader' ->> 'signerName', ''))
      )
    where id = p_checklist_id
      and signature_requests -> 'leader' ->> 'token' = p_token
    returning id into v_result;
  else
    update public.checklists
    set
      monitor_signature = p_signature,
      monitor_signed_at = v_signed_at,
      signatures = coalesce(signatures, '{}'::jsonb) || jsonb_build_object('monitorSignature', p_signature),
      signature_requests = jsonb_set(
        coalesce(signature_requests, '{}'::jsonb),
        '{monitor}',
        coalesce(signature_requests -> 'monitor', '{}'::jsonb) ||
        jsonb_build_object('token', '', 'signedAt', v_signed_at, 'signerName', coalesce(p_signer_name, signature_requests -> 'monitor' ->> 'signerName', ''))
      )
    where id = p_checklist_id
      and signature_requests -> 'monitor' ->> 'token' = p_token
    returning id into v_result;
  end if;

  if v_result is null then
    raise exception 'invalid or expired signature token';
  end if;

  return v_result;
end;
$$;

revoke all on function public.sign_checklist_by_token(uuid, text, text, text, text) from public;
grant execute on function public.sign_checklist_by_token(uuid, text, text, text, text) to anon;
grant execute on function public.sign_checklist_by_token(uuid, text, text, text, text) to authenticated;
