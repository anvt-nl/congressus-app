# Show all events with starttime, id and description

```bash
cat get_events.json| jq '.data[] | "\(.start) - \(.id) - \(.name)"'


cat get_events.json| jq '.data[] | "\(.start) - \(.id) - \(.name) \(.ticket_types[0].num_tickets_sold)/\(.ticket_types[0].num_tickets)"'


cat get_events.json| jq -r '.data[] | [.start, .id, .ticket_types[0].num_tickets_sold, .ticket_types[0].num_tickets, .name] | @tsv '| column -t -s $'\t'
```
