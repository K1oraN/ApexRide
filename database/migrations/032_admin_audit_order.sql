-- Allocate the final chain ID only after acquiring the serialization lock.
-- Identity defaults are evaluated before BEFORE INSERT triggers and can arrive out of order.
CREATE OR REPLACE FUNCTION admin_audit_chain() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 PERFORM pg_advisory_xact_lock(220026);
 NEW.id:=nextval(pg_get_serial_sequence(format('%I.admin_audit_logs',TG_TABLE_SCHEMA),'id'));
 NEW.created_at:=clock_timestamp();
 SELECT entry_hash INTO NEW.previous_hash FROM admin_audit_logs ORDER BY id DESC LIMIT 1;
 NEW.previous_hash:=COALESCE(NEW.previous_hash,'');
 NEW.entry_hash:=encode(sha256(convert_to(jsonb_build_array(NEW.previous_hash,NEW.id,NEW.actor_id,NEW.action,NEW.resource_type,NEW.resource_id,NEW.permission_used,NEW.outcome,NEW.reason_code,NEW.correlation_id,NEW.created_at)::text,'UTF8')),'hex');
 RETURN NEW;
END $$;
