-- Fix security warnings: add SET search_path to functions for better security
ALTER FUNCTION encrypt_token(text) SET search_path = '';
ALTER FUNCTION decrypt_token(text) SET search_path = '';
ALTER FUNCTION insert_encrypted_gmail_connection(text, text, text, timestamp with time zone) SET search_path = '';
ALTER FUNCTION get_decrypted_gmail_tokens(uuid) SET search_path = '';
ALTER FUNCTION update_encrypted_gmail_tokens(uuid, text, text, timestamp with time zone) SET search_path = '';