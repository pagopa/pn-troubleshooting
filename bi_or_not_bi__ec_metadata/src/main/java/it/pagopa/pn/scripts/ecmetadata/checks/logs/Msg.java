package it.pagopa.pn.scripts.ecmetadata.checks.logs;

public class Msg {

    public static Msg fileListed( String fileName ) {
        Msg msg = new Msg();
        msg.msgType = MsgType.FILE_LISTED;
        msg.text = fileName;
        return msg;
    }

    public static Msg readFileStart( String fileName ) {
        Msg msg = new Msg();
        msg.msgType = MsgType.READ_FILE_START;
        msg.text = fileName;
        return msg;
    }


    public static Msg jobScheduled( String jobName ) {
        Msg msg = new Msg();
        msg.msgType = MsgType.JOB_SCHEDULED;
        msg.text = jobName;
        return msg;
    }

    public static Msg jobStart( String jobName ) {
        Msg msg = new Msg();
        msg.msgType = MsgType.JOB_START;
        msg.text = jobName;
        return msg;
    }

    public static Msg jobDone( String jobName) {
        Msg msg = new Msg();
        msg.msgType = MsgType.JOB_DONE;
        msg.text = jobName;
        return msg;
    }

    private MsgType msgType;

    public MsgType getMsgType() {
        return msgType;
    }

    private String text;

    public String getText() {
        return text;
    }

    enum MsgType {

        FILE_LISTED,
        READ_FILE_START,
        JOB_SCHEDULED,
        JOB_START,
        JOB_DONE;
    }

}
