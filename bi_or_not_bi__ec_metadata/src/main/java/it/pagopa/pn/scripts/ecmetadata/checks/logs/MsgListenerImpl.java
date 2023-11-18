package it.pagopa.pn.scripts.ecmetadata.checks.logs;

import it.pagopa.pn.scripts.ecmetadata.checks.logs.IMessageListener;
import it.pagopa.pn.scripts.ecmetadata.checks.logs.Msg;

public class MsgListenerImpl implements IMessageListener {

    private long start = System.currentTimeMillis();

    @Override
    public void accept(Msg msg) {
        long deltaTime = System.currentTimeMillis() - start;

        System.out.println( msg.getMsgType() + ") " + msg.getText() + " at " + deltaTime + "ms");
    }
}
