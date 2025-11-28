-- Add profile for the licensed agent
INSERT INTO "public"."profiles" ("user_id", "display_name", "created_at", "updated_at") 
VALUES (
    '3e428131-5b7e-4693-83ed-ef20f9530d76', 
    'Licensed Agent', 
    NOW(), 
    NOW()
);

-- You can also update this with a more specific name if you know who this LA is:
-- UPDATE "public"."profiles" 
-- SET "display_name" = 'John Doe (LA)' 
-- WHERE "user_id" = '3e428131-5b7e-4693-83ed-ef20f9530d76';
