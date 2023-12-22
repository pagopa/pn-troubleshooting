WITH
  analog_workflows_and_his_completion AS (
    select
      t.iun,
      get_json_object( t.details, '$.recIndex ') as recIndex,
      t.paid,
      max(case 
      	when t.category = 'SEND_ANALOG_FEEDBACK' then get_json_object( t.details, '$.notificationDate ')
      	when t.category = 'PREPARE_ANALOG_DOMICILE_FAILURE' then t.`timestamp`
      	else null
      end)
        as end_analog_workflow_business_date
    from
      pagopa_any_services_pn.timeline t
    where
      t.category in ('SEND_ANALOG_FEEDBACK', 'PREPARE_ANALOG_DOMICILE_FAILURE')
    group by 
      t.iun,
      get_json_object( t.details, '$.recIndex '),
      t.paid
  ),
  refinements_dates_from_db AS (
    select
      t.iun,
      get_json_object( t.details, '$.recIndex ') as recIndex,
      t.`timestamp` as refinement_date_from_db
    from
      pagopa_any_services_pn.timeline t
    where
      t.category in ('REFINEMENT' )
  ),
  visualization_dates_from_db AS (
    select
      t.iun,
      get_json_object( t.details, '$.recIndex ') as recIndex,
      t.`timestamp` as notification_viewed_from_db
    from
      pagopa_any_services_pn.timeline t
    where
      t.category in ('NOTIFICATION_VIEWED_CREATION_REQUEST' )
  ),
  report_table AS (
    SELECT
      w.iun,
      w.recIndex,
      w.paid,
      cast( w.end_analog_workflow_business_date as timestamp) as end_analog_workflow_business_date,
      date_add(cast( w.end_analog_workflow_business_date as timestamp), interval 10 days) as analog_refinement_business_date,
      cast( r.refinement_date_from_db as timestamp ) as refinement_date_from_db,
      cast( v.notification_viewed_from_db as timestamp ) as notification_viewed_from_db
    FROM
      analog_workflows_and_his_completion w 
      LEFT JOIN refinements_dates_from_db r ON w.iun = r.iun and w.recIndex = r.recIndex
      LEFT JOIN visualization_dates_from_db v ON w.iun = v.iun and w.recIndex = v.recIndex
  ),
  all_istitutions AS 
	(
	SELECT distinct
	  internalistitutionid,
	  institution.description as pa_name
	FROM 
		pagopa_any_registries_contracts.selfcare_contracts
	WHERE 
			product = 'prod-pn'
		and 
			state = 'ACTIVE'
	),
	recipients_by_iun AS
	(
 	SELECT 
 		iun, 
 		cast(recipients.pos as string) as recIndex,
 		recipients.recipientType,
 		recipients.recipientId
 	FROM 
 		pagopa_any_services_pn.notification, 
 		pagopa_any_services_pn.notification.recipients 
	), 
elenco_notifiche as (
SELECT 
	a.pa_name as ente, 
	r.iun, 
	r.recindex, 
	d.recipientId,
	r.refinement_date_from_db as data_di_perfezionamento_errata,
	r.analog_refinement_business_date as data_di_perfezionamento_corretta,
	r.notification_viewed_from_db as data_di_visualizzazione,
	(
	NOT (
		refinement_date_from_db is NULL AND notification_viewed_from_db is NULL -- tolgo le notifiche ancora in corso
	) 
	AND NOT ( 
		notification_viewed_from_db is NOT NULL 
			AND (
				( refinement_date_from_db is NULL AND notification_viewed_from_db <= analog_refinement_business_date )
				OR 
				( refinement_date_from_db is not NULL AND notification_viewed_from_db > analog_refinement_business_date )
			)
	)
	AND TRUNC(analog_refinement_business_date, 'MI') != TRUNC(refinement_date_from_db, 'MI')) as errore_secondo_ff,
	(
    NOT (
      ( refinement_date_from_db is null and notification_viewed_from_db is null ) -- quelle ancora in corso sono considerate corrette
    OR
      ( 
          notification_viewed_from_db is null
        AND
            trunc( analog_refinement_business_date, 'MI' ) 
          = 
            trunc( refinement_date_from_db, 'MI' )
      ) -- quelle non visualizzate e data di perfezionamento calcolata e su db uguali a meno di un minuto sono considerate corrette
    OR
      ( 
          notification_viewed_from_db is not null 
        AND
          notification_viewed_from_db < analog_refinement_business_date
        AND
          refinement_date_from_db is null
      ) -- le visualizzate prima del perfezionamento teorico che non hanno perfezionamento decorrenza termini sul db ... cono corrette
    OR
      ( 
          notification_viewed_from_db is not null 
        AND
          notification_viewed_from_db > analog_refinement_business_date
        AND
          refinement_date_from_db is not null
        AND
            trunc( analog_refinement_business_date, 'MI' ) 
          = 
            trunc( refinement_date_from_db, 'MI' )
      ) -- le visualizzate prima del perfezionamento teorico che non hanno perfezionamento decorrenza termini sul db ... cono corrette
  )
  ) as errore_secondo_mvit
FROM
  report_table r LEFT JOIN all_istitutions a
  ON r.paid = a.internalistitutionid
  JOIN recipients_by_iun d
  ON d.iun = r.iun AND d.recIndex=r.recindex
)
SELECT 	
    ente, 
	iun, 
	recindex, 
	recipientId,
	data_di_perfezionamento_errata,
	data_di_perfezionamento_corretta,
	data_di_visualizzazione
FROM elenco_notifiche
WHERE errore_secondo_mvit;
	

	