-- Remove the old unique_active_gmail_email index that prevents multiple users from connecting the same email
DROP INDEX IF EXISTS unique_active_gmail_email;