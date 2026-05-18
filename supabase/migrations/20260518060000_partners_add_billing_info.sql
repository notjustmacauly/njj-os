-- Partners need legal entity name + TIN for B2B invoicing (Philippines).
-- Both nullable: casual partners may not have these to provide, big B2B
-- partners absolutely will. UI should warn/require when issuing a bill.

alter table public.partners
  add column if not exists registered_business_name text,
  add column if not exists tin                       text;

comment on column public.partners.registered_business_name is
  'Legal entity name as registered with SEC/DTI. Distinct from the display "name" field (e.g. "Acme Hospitality Inc." vs trade name "Acme Cafe").';
comment on column public.partners.tin is
  'Philippine Tax Identification Number. Typically formatted XXX-XXX-XXX-XXX or 9-13 digits. Free text so we can match whatever format the partner provides.';
