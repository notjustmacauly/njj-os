-- Add CSM (CSM organising income) and TBM (The Bay Markets) as revenue
-- categories, so income can be tracked and compared against the matching
-- CSM / TBM expense categories. (TBM is added to the expense category list
-- in the app; CSM already exists there.)
alter type public.revenue_category add value if not exists 'csm';
alter type public.revenue_category add value if not exists 'tbm';
