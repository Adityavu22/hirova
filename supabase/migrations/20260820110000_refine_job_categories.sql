-- Reclassify imported jobs using title-level word boundaries so terms such as
-- "campaign" do not accidentally match the AI category token.
update public.job_market
set category = case
  when title ~* '\m(product manager|product owner)\M' then 'Product'
  when title ~* '\m(designer|design|ux|ui)\M' then 'Design'
  when title ~* '\m(sales|business development|account executive)\M' then 'Sales'
  when title ~* '\m(marketing|growth|content|brand)\M' then 'Marketing'
  when title ~* '\m(finance|accountant|audit|tax)\M' then 'Finance'
  when title ~* '\m(human resources|recruiter|talent|people)\M' then 'Human Resources'
  when title ~* '\m(operations|supply chain|customer support|customer success)\M' then 'Operations'
  when title ~* '\m(software|developer|engineer|devops|cloud|security|data|machine learning|ai)\M' then 'Technology'
  else 'Other'
end
where origin = 'aggregated';
