

makeBars = function( data, barnorm ) {
  data['track0'] = 0
  
  fig <- plot_ly(data, y = ~day, x = ~track0, type = 'bar', orientation = 'h')
  fig <- fig %>% add_trace(x = ~accepted, name = 'accepted', marker = list(color = 'rgba(127, 127, 127, 1)'))
  fig <- fig %>% add_trace(x = ~refused, name = 'refused', marker = list(color = 'rgba(200, 0, 0, 1)'))
  fig <- fig %>% add_trace(x = ~printing, name = 'printing', marker = list(color = 'rgba(0, 0, 200, 1)'))
  fig <- fig %>% add_trace(x = ~UNKNOWN, name = 'UNKNOWN', marker = list(color = 'rgba(255, 140, 0, 1)'))
  fig <- fig %>% add_trace(x = ~done, name = 'done', marker = list(color = 'rgba(00, 200, 00, 1)'))
  fig <- fig %>% layout(barmode = 'stack', barnorm = barnorm,
                        xaxis = list(title = ""),
                        yaxis = list(title =""))
  fig
}


makeTable = function( data ) {

  errorTable <- plot_ly(
    type = 'table',
    header = list(
      values = c('<b>DAY</b>', '<b>refused</b>', '<b>printing</b>', '<b>UNKNOWN</b>','<b>Sent Total</b>'),
      line = list(color = '#111111'),
      fill = list(color = '#FFFFFF'),
      align = c('left','center'),
      font = list(color = 'black', size = 14)
    ),
    cells = list(
      values = rbind(
          strftime( data$day, '%Y-%m-%d'),
          data$refused,
          data$printing,
          data$UNKNOWN,
          data$cardinality
        ),
      line = list(color = '#111111'),
      fill = list(color = c('#F0F0F0', 'white')),
      align = c('left', 'center'),
      font = list(color = c('black'), size = 14)
    ))
  errorTable
}
