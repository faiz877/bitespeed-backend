-- Defining a custom ENUM type for 'linkPrecedence'.
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'linkprecedence_enum') THEN
        CREATE TYPE linkprecedence_enum AS ENUM ('primary', 'secondary');
    END IF;
END
$$;

-- Creating the 'Contact' table.
CREATE TABLE IF NOT EXISTS Contact (
    id SERIAL PRIMARY KEY, 
    phoneNumber VARCHAR(20), 
    email VARCHAR(255),      
    linkedId INT REFERENCES Contact(id), -- Foreign key: links to another 'Contact' id
    linkPrecedence linkprecedence_enum NOT NULL, -- Uses the ENUM type defined above
    createdAt TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP, 
    updatedAt TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP, 
    deletedAt TIMESTAMP WITH TIME ZONE NULL
);

-- Add indexes for performance.
CREATE INDEX IF NOT EXISTS idx_contact_email ON Contact (email);
CREATE INDEX IF NOT EXISTS idx_contact_phonenumber ON Contact (phoneNumber);
CREATE INDEX IF NOT EXISTS idx_contact_linkedid ON Contact (linkedId);