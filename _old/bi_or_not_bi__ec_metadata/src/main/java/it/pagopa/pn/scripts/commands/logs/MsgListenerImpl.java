package it.pagopa.pn.scripts.commands.logs;

public class MsgListenerImpl implements IMessageListener {

    private long start = System.currentTimeMillis();

    @Override
    public void accept(Msg msg) {
        long deltaTime = System.currentTimeMillis() - start;

        System.out.println( msg.getMsgType() + ") " + msg.getText() + " at " + deltaTime + "ms");
    }
}
