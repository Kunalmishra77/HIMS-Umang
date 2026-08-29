# Copy to d:/tmp/hims-migration/env.sh and fill with real values. NEVER commit the filled file.
export OLD_DB="postgresql://postgres.rojzpogpykqfccbssrsv:<OLD_DB_PASSWORD>@aws-1-ap-south-1.pooler.supabase.com:6543/postgres"
export NEW_DB_SESSION="postgresql://postgres.uidhrfybgptqllzztgyb:<NEW_DB_PASSWORD>@aws-1-ap-south-1.pooler.supabase.com:5432/postgres"
export NEW_DB_TX="postgresql://postgres.uidhrfybgptqllzztgyb:<NEW_DB_PASSWORD>@aws-1-ap-south-1.pooler.supabase.com:6543/postgres"
export NEW_SUPABASE_URL="https://uidhrfybgptqllzztgyb.supabase.co"
export NEW_ANON_KEY="<NEW_ANON_KEY>"
export NEW_SERVICE_ROLE_KEY="<NEW_SERVICE_ROLE_KEY>"
