-- Essential schema for Visual Subnet Planner

CREATE TABLE public.tbl_building (
    "ID" integer GENERATED ALWAYS AS IDENTITY (START WITH 1000 INCREMENT BY 1),
    name text,
    slug text,
    mailing_address text,
    CONSTRAINT "buildingID" PRIMARY KEY ("ID")
);

CREATE TABLE public.tbl_floors (
    id integer GENERATED ALWAYS AS IDENTITY (START WITH 1000 INCREMENT BY 1),
    "buildingID" integer NOT NULL,
    number integer NOT NULL,
    name text,
    CONSTRAINT "floorID" PRIMARY KEY (id)
);

CREATE TABLE public.tbl_idf (
    "ID" integer GENERATED ALWAYS AS IDENTITY (START WITH 1000 INCREMENT BY 1),
    "floorID" integer NOT NULL,
    name text NOT NULL,
    CONSTRAINT "idfID" PRIMARY KEY ("ID")
);

CREATE TABLE public.tbl_rack (
    "ID" integer GENERATED ALWAYS AS IDENTITY (START WITH 1000 INCREMENT BY 1),
    "idfID" integer NOT NULL,
    "totalU" integer NOT NULL,
    "rackType" text,
    name text,
    CONSTRAINT "rackID" PRIMARY KEY ("ID")
);

CREATE TABLE public.tbl_device (
    "ID" integer GENERATED ALWAYS AS IDENTITY (START WITH 1000 INCREMENT BY 1),
    "rackID" integer NOT NULL,
    "deviceType" text NOT NULL,
    "mgmtIP" inet NOT NULL,
    name text NOT NULL,
    "firstRackU" integer,
    "rackUSize" integer,
    "stackMember" boolean NOT NULL,
    manufacturer text,
    model text,
    CONSTRAINT "deviceID" PRIMARY KEY ("ID")
);

CREATE TABLE public.tbl_supernet (
    "ID" integer GENERATED ALWAYS AS IDENTITY (START WITH 1000 INCREMENT BY 1),
    network cidr NOT NULL,
    building_id integer NOT NULL,
    CONSTRAINT "supernetID" PRIMARY KEY ("ID")
);

CREATE TABLE public.tbl_subnet (
    "ID" integer GENERATED ALWAYS AS IDENTITY (START WITH 1000 INCREMENT BY 1),
    "supernetID" integer NOT NULL,
    network cidr NOT NULL,
    name text,
    "vlanID" integer,
    "gatewayIP" inet NOT NULL,
    avail_hosts integer NOT NULL,
    CONSTRAINT "subnetID" PRIMARY KEY ("ID")
);

CREATE TABLE public.tbl_interface (
    "ID" integer GENERATED ALWAYS AS IDENTITY (START WITH 1000 INCREMENT BY 1),
    "deviceID" integer NOT NULL,
    name text NOT NULL,
    type text NOT NULL,
    "subnetID" integer,
    "ipAddress" inet,
    description text,
    CONSTRAINT "interfaceID" PRIMARY KEY ("ID")
);

ALTER TABLE public.tbl_floors
    ADD CONSTRAINT "buildingID" FOREIGN KEY ("buildingID") REFERENCES public.tbl_building ("ID");

ALTER TABLE public.tbl_idf
    ADD CONSTRAINT "floorID" FOREIGN KEY ("floorID") REFERENCES public.tbl_floors (id);

ALTER TABLE public.tbl_rack
    ADD CONSTRAINT "idfID" FOREIGN KEY ("idfID") REFERENCES public.tbl_idf ("ID");

ALTER TABLE public.tbl_device
    ADD CONSTRAINT "rackID" FOREIGN KEY ("rackID") REFERENCES public.tbl_rack ("ID");

ALTER TABLE public.tbl_supernet
    ADD CONSTRAINT pk_building FOREIGN KEY (building_id) REFERENCES public.tbl_building ("ID");

ALTER TABLE public.tbl_subnet
    ADD CONSTRAINT "supernetID" FOREIGN KEY ("supernetID") REFERENCES public.tbl_supernet ("ID");

ALTER TABLE public.tbl_interface
    ADD CONSTRAINT "deviceID" FOREIGN KEY ("deviceID") REFERENCES public.tbl_device ("ID");

ALTER TABLE public.tbl_interface
    ADD CONSTRAINT "subnetID" FOREIGN KEY ("subnetID") REFERENCES public.tbl_subnet ("ID") NOT VALID;
