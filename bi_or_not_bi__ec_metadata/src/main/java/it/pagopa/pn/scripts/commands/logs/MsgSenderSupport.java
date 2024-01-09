package it.pagopa.pn.scripts.commands.logs;

import java.util.ArrayList;
import java.util.List;

public class MsgSenderSupport {

    private List<IMessageListener> listeners = new ArrayList<>();

    public void addListener( IMessageListener listener ) {
        if( listener != null ) {
            this.listeners.add( listener );
        }
    }

    protected void fireMessage( Msg msg ) {
        for( IMessageListener lsnr: this.listeners ) {
            lsnr.accept( msg );
        }
    }

}
