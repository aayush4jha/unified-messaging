-- Meta business messaging connectors are implemented (business accounts only).
update public.platforms set support = 'live' where id in ('whatsapp', 'messenger', 'instagram');
